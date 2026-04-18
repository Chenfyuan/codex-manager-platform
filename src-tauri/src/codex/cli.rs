use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Copy)]
enum InvocationKind {
    Direct,
    #[cfg(target_os = "macos")]
    PosixShell,
    Cmd,
    PowerShell,
}

#[derive(Debug, Clone)]
pub struct CodexCli {
    path: PathBuf,
    invocation: InvocationKind,
}

impl CodexCli {
    fn from_path(path: PathBuf) -> Self {
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        #[cfg(target_os = "macos")]
        let invocation = InvocationKind::PosixShell;

        #[cfg(target_os = "windows")]
        let invocation = match ext.as_str() {
            "cmd" | "bat" => InvocationKind::Cmd,
            "ps1" => InvocationKind::PowerShell,
            _ => InvocationKind::Direct,
        };

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        let invocation = InvocationKind::Direct;

        Self { path, invocation }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn std_command(&self) -> std::process::Command {
        let mut command = match self.invocation {
            InvocationKind::Direct => std::process::Command::new(&self.path),
            #[cfg(target_os = "macos")]
            InvocationKind::PosixShell => {
                let mut command = std::process::Command::new(preferred_posix_shell());
                command
                    .args(["-ilc", "exec \"$0\" \"$@\""])
                    .arg(&self.path);
                command
            }
            InvocationKind::Cmd => {
                let mut command = std::process::Command::new("cmd");
                command.arg("/C").arg(&self.path);
                command
            }
            InvocationKind::PowerShell => {
                let mut command = std::process::Command::new("powershell");
                command
                    .args(["-ExecutionPolicy", "Bypass", "-File"])
                    .arg(&self.path);
                command
            }
        };
        configure_background_command(&mut command);
        command
    }

    pub fn tokio_command(&self) -> tokio::process::Command {
        let mut command = match self.invocation {
            InvocationKind::Direct => tokio::process::Command::new(&self.path),
            #[cfg(target_os = "macos")]
            InvocationKind::PosixShell => {
                let mut command = tokio::process::Command::new(preferred_posix_shell());
                command
                    .args(["-ilc", "exec \"$0\" \"$@\""])
                    .arg(&self.path);
                command
            }
            InvocationKind::Cmd => {
                let mut command = tokio::process::Command::new("cmd");
                command.arg("/C").arg(&self.path);
                command
            }
            InvocationKind::PowerShell => {
                let mut command = tokio::process::Command::new("powershell");
                command
                    .args(["-ExecutionPolicy", "Bypass", "-File"])
                    .arg(&self.path);
                command
            }
        };
        configure_background_tokio_command(&mut command);
        command
    }

    pub fn shell_invocation(&self) -> String {
        let path = self.path.to_string_lossy();

        #[cfg(target_os = "windows")]
        {
            format!("& {}", quote_powershell(&path))
        }

        #[cfg(not(target_os = "windows"))]
        {
            quote_posix(&path)
        }
    }
}

pub fn resolve_codex_cli() -> Result<CodexCli, String> {
    if let Some(path) = std::env::var_os("CODEX_CLI_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(CodexCli::from_path(path));
        }
    }

    for path in candidate_paths() {
        if path.is_file() {
            return Ok(CodexCli::from_path(path));
        }
    }

    Err("未检测到 Codex CLI，请先安装 Codex CLI 并确保其已加入 PATH".into())
}

pub fn shell_invocation() -> Result<String, String> {
    Ok(resolve_codex_cli()?.shell_invocation())
}

pub fn shell_command_with_env(name: &str, value: &str) -> Result<String, String> {
    let invocation = shell_invocation()?;

    #[cfg(target_os = "windows")]
    {
        Ok(format!(
            "$env:{}={}; {}",
            name,
            quote_powershell(value),
            invocation,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(format!(
            "{}={}",
            name,
            quote_posix(value),
        ) + " " + &invocation)
    }
}

fn candidate_paths() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut paths = Vec::new();
        for query in ["codex.exe", "codex.cmd", "codex.ps1", "codex"] {
            extend_paths(&mut paths, command_output_paths("where.exe", &[query]));
        }
        paths
    }

    #[cfg(target_os = "macos")]
    {
        let mut paths = Vec::new();
        extend_paths(&mut paths, path_env_candidates("codex"));
        extend_paths(&mut paths, common_macos_codex_paths());
        extend_paths(&mut paths, command_output_paths("which", &["codex"]));
        extend_paths(&mut paths, login_shell_output_paths("codex"));
        paths
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let mut paths = path_env_candidates("codex");
        extend_paths(&mut paths, command_output_paths("which", &["codex"]));
        paths
    }
}

fn command_output_paths(program: impl AsRef<std::ffi::OsStr>, args: &[&str]) -> Vec<PathBuf> {
    let mut command = std::process::Command::new(program);
    configure_background_command(&mut command);
    let output = match command.args(args).output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect()
}

fn extend_paths(paths: &mut Vec<PathBuf>, new_paths: Vec<PathBuf>) {
    for path in new_paths {
        if !paths.iter().any(|existing| existing == &path) {
            paths.push(path);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn path_env_candidates(binary: &str) -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths)
                .map(|dir| dir.join(binary))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn common_macos_codex_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ];

    if let Some(home) = dirs::home_dir() {
        paths.extend([
            home.join(".local/bin/codex"),
            home.join("bin/codex"),
            home.join(".volta/bin/codex"),
            home.join(".npm-global/bin/codex"),
            home.join("Library/pnpm/codex"),
            home.join(".asdf/shims/codex"),
        ]);
    }

    paths
}

#[cfg(target_os = "macos")]
fn login_shell_output_paths(binary: &str) -> Vec<PathBuf> {
    let script = format!("which -a {} 2>/dev/null", quote_posix(binary));
    let mut paths = Vec::new();

    for shell in login_shell_candidates() {
        extend_paths(
            &mut paths,
            command_output_paths(shell, &["-ilc", script.as_str()]),
        );
    }

    paths
}

#[cfg(target_os = "macos")]
fn login_shell_candidates() -> Vec<PathBuf> {
    let mut shells = Vec::new();

    if let Some(shell) = std::env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        shells.push(shell);
    }

    for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
        let path = PathBuf::from(shell);
        if path.is_file() && !shells.iter().any(|existing| existing == &path) {
            shells.push(path);
        }
    }

    shells
}

#[cfg(target_os = "macos")]
fn preferred_posix_shell() -> PathBuf {
    login_shell_candidates()
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("/bin/zsh"))
}

pub fn configure_background_command(command: &mut std::process::Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    let _ = command;
}

pub fn configure_background_tokio_command(command: &mut tokio::process::Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    let _ = command;
}

#[cfg(target_os = "windows")]
fn quote_powershell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(not(target_os = "windows"))]
fn quote_posix(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

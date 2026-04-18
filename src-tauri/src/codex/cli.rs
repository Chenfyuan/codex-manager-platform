use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Copy)]
enum InvocationKind {
    Direct,
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

        let invocation = match ext.as_str() {
            "cmd" | "bat" => InvocationKind::Cmd,
            "ps1" => InvocationKind::PowerShell,
            _ => InvocationKind::Direct,
        };

        Self { path, invocation }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn std_command(&self) -> std::process::Command {
        let mut command = match self.invocation {
            InvocationKind::Direct => std::process::Command::new(&self.path),
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

    #[cfg(not(target_os = "windows"))]
    {
        command_output_paths("which", &["codex"])
    }
}

fn command_output_paths(program: &str, args: &[&str]) -> Vec<PathBuf> {
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

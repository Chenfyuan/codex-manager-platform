/**
 * Tauri mock for Playwright E2E tests.
 * Injected via page.addInitScript() BEFORE the app loads.
 * Mocks window.__TAURI_INTERNALS__ and plugin internals so the React app
 * runs in a plain browser without the Tauri runtime.
 */

// -- Fake accounts state (mutable, shared across invoke calls) --
const _accounts = [];
let _idCounter = 1;

function makeAccount(name, authMethod, credential) {
  return {
    id: `acc-${_idCounter++}`,
    name,
    authMethod,
    status: "disconnected",
    maxThreads: 5,
    activeThreads: 0,
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
  };
}

// -- Invoke handler --
async function tauriInvoke(cmd, args) {
  switch (cmd) {
    case "detect_codex_cli":
      return { found: true, path: "/usr/local/bin/codex", version: "0.1.0" };

    case "get_accounts":
      return [..._accounts];

    case "add_account": {
      const acc = makeAccount(args.name, args.authMethod, args.credential);
      _accounts.push(acc);
      return acc;
    }

    case "remove_account": {
      const idx = _accounts.findIndex((a) => a.id === args.accountId);
      if (idx !== -1) _accounts.splice(idx, 1);
      return null;
    }

    case "connect_account": {
      const a = _accounts.find((a) => a.id === args.accountId);
      if (a) a.status = "connected";
      return null;
    }

    case "disconnect_account": {
      const a = _accounts.find((a) => a.id === args.accountId);
      if (a) a.status = "disconnected";
      return null;
    }

    case "update_account_name": {
      const a = _accounts.find((a) => a.id === args.accountId);
      if (a) a.name = args.name;
      return null;
    }

    case "update_account_credential":
      return null;

    case "get_threads":
      return [];

    case "create_thread":
      return {
        id: `thread-${Date.now()}`,
        accountId: args.accountId,
        title: "",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turnCount: 0,
      };

    case "start_turn":
      return { turn_id: `turn-${Date.now()}` };

    case "interrupt_turn":
    case "save_stream_item":
      return null;

    case "get_thread_history":
      return [];

    case "start_oauth_login":
      return "https://example.com/oauth";

    case "check_oauth_status":
      return false;

    case "detect_existing_credentials":
      return [];

    case "import_account": {
      const acc = makeAccount(args.name, args.authMethod, args.credential);
      _accounts.push(acc);
      return acc;
    }

    case "fetch_account_info":
      return {
        account: {
          type: "apiKey",
          email: "user@example.com",
          planType: "plus",
        },
        requiresOpenaiAuth: false,
      };

    case "fetch_rate_limits":
      return {
        rateLimits: {
          limitId: "codex",
          limitName: "5小时限额",
          planType: "plus",
          primary: {
            usedPercent: 42,
            windowDurationMins: 300,
            resetsAt: Math.floor(Date.now() / 1000) + 7200,
          },
        },
      };

    case "fetch_model_list":
      return {
        data: [
          { id: "o3-pro", model: "o3-pro", displayName: "o3-pro", isDefault: true, hidden: false },
          { id: "gpt-4o", model: "gpt-4o", displayName: "GPT-4o", isDefault: false, hidden: false },
        ],
      };

    case "activate_account": {
      return null;
    }

    case "get_active_credential":
      return null;

    case "check_quota":
      return {
        email: "test@example.com",
        planType: "plus",
        primaryUsedPercent: 42,
        primaryResetsAt: Math.floor(Date.now() / 1000) + 7200,
        primaryWindowMins: 300,
        secondaryUsedPercent: 15,
        secondaryResetsAt: Math.floor(Date.now() / 1000) + 86400,
        secondaryWindowMins: 10080,
        creditsBalance: null,
        error: null,
      };

    case "check_all_quotas":
      return _accounts.map(a => [a.id, {
        email: `${a.name}@example.com`,
        planType: "plus",
        primaryUsedPercent: Math.floor(Math.random() * 80),
        primaryResetsAt: Math.floor(Date.now() / 1000) + 7200,
        primaryWindowMins: 300,
        secondaryUsedPercent: Math.floor(Math.random() * 40),
        secondaryResetsAt: Math.floor(Date.now() / 1000) + 86400,
        secondaryWindowMins: 10080,
        creditsBalance: null,
        error: null,
      }]);

    default:
      console.warn("[tauri-mock] unhandled invoke:", cmd, args);
      return null;
  }
}

// -- Callback registry for transformCallback / listen --
let _cbId = 0;
const _callbacks = {};

window.__TAURI_INTERNALS__ = {
  metadata: {
    currentWindow: { label: "main" },
    currentWebview: { label: "main" },
  },
  invoke: tauriInvoke,
  transformCallback(callback, once) {
    const id = `_${++_cbId}`;
    _callbacks[id] = callback;
    window[id] = callback;
    return id;
  },
  unregisterCallback(id) {
    delete _callbacks[id];
    delete window[id];
  },
  convertFileSrc(path, protocol) {
    return path;
  },
};

// Event plugin internals
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener() {},
};



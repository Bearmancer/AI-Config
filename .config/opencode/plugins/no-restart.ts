import { Plugin } from "@opencode/plugin";

const cli =
  /(?:^|[\s"'&\\\/])opencode(?:\.(?:exe|cmd|ps1))?["']?\s+(?:[^\n]*?\s)?(?:service\s+(?:restart|stop|start|set|unset)\b|serve\s+--service\b)/i;
const lifecycle =
  /(?:^|[\s"'&\\\/])opencode(?:\.(?:exe|cmd|ps1))?["']?\s+(?:--?[\w-]+(?:=\S+)?\s+)*(?:upgrade|update|uninstall)\b/i;
const task =
  /(?:enable-scheduledtask|register-scheduledtask|set-scheduledtask|schtasks\s+\/(?:change|create))/i;
const taskName = /opencode-serve-tailnet/i;
const processName = /(?<![\w.\\\/-])opencode(?:\.exe)?(?![\w.\\\/-])/i;
const killer = /(?:^|[\n|;&({])\s*&?\s*(?:stop-process|spps|taskkill|pkill|killall|kill)\b|\.kill\s*\(/i;
const quoted = /"[^"]*"|'[^']*'/g;
const self = new RegExp(`(?<![\\w.])${process.pid}(?![\\w.])`);

const restarts = (resources: readonly string[]) => {
  const text = resources.join("\n");
  if (resources.some((resource) => cli.test(resource) || lifecycle.test(resource))) return true;
  if (resources.some((resource) => task.test(resource) && taskName.test(resource))) return true;
  if (!killer.test(text.replace(quoted, ""))) return false;
  return processName.test(text) || self.test(text);
};

export default Plugin.define({
  id: "no-restart",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", (event) => {
      if (event.action !== "shell") return;
      if (!restarts(event.resources)) return;
      event.effect = "deny";
      event.message =
        "Blocked by no-restart: restarting, stopping, starting, reconfiguring, upgrading, uninstalling or killing OpenCode is forbidden. Config changes apply without a restart; if a reload is needed, ask the user to run /reload.";
    });
  },
});

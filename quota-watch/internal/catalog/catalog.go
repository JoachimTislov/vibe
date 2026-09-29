// Package catalog contains Quota Watch's versioned, declarative provider catalogue.
package catalog

type Entry struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Family       string   `json:"family"`
	Tier         string   `json:"tier"`
	Capabilities []string `json:"capabilities"`
	SetupMode    string   `json:"setup_mode"`
	Privacy      string   `json:"privacy_class"`
	Executables  []string `json:"-"`
	Env          []string `json:"-"`
	ConfigDirs   []string `json:"-"`
}

type Catalogue struct {
	Version string  `json:"version"`
	Entries []Entry `json:"entries"`
}

// TierA returns a deep copy of the stable Tier-A catalogue.
func TierA() Catalogue {
	entries := make([]Entry, len(tierA))
	for i, entry := range tierA {
		entries[i] = entry
		entries[i].Capabilities = append([]string(nil), entry.Capabilities...)
		entries[i].Executables = append([]string(nil), entry.Executables...)
		entries[i].Env = append([]string(nil), entry.Env...)
		entries[i].ConfigDirs = append([]string(nil), entry.ConfigDirs...)
	}
	return Catalogue{Version: "2026-09-28.1", Entries: entries}
}

func e(id, name, family, setup string, exec, env, dirs []string, capabilities ...string) Entry {
	return Entry{ID: id, Name: name, Family: family, Tier: "A", SetupMode: setup, Privacy: "local_metadata", Executables: exec, Env: env, ConfigDirs: dirs, Capabilities: capabilities}
}

var tierA = []Entry{
	e("codex", "Codex / ChatGPT", "AI coding", "existing_cli", []string{"codex"}, []string{"OPENAI_ADMIN_KEY", "OPENAI_API_KEY"}, []string{".codex"}, "subscription_quota", "api_usage"),
	e("claude", "Claude Code / Anthropic", "AI coding", "existing_cli", []string{"claude", "ccusage"}, []string{"ANTHROPIC_ADMIN_KEY", "ANTHROPIC_API_KEY"}, []string{".claude"}, "subscription_quota", "local_activity", "api_usage"),
	e("cursor", "Cursor", "AI coding", "admin_key", []string{"cursor"}, []string{"CURSOR_API_KEY"}, []string{".cursor"}, "detection", "team_usage"),
	e("github", "GitHub Copilot & developer usage", "Developer platform", "existing_cli", []string{"gh"}, []string{"GH_TOKEN", "GITHUB_TOKEN"}, []string{".config/gh"}, "billing", "actions", "packages", "codespaces"),
	e("gemini", "Gemini CLI / Vertex AI", "AI platform", "existing_cli", []string{"gemini", "gcloud"}, []string{"GEMINI_API_KEY", "GOOGLE_CLOUD_PROJECT"}, []string{".gemini", ".config/gcloud"}, "local_activity", "api_usage", "cloud_billing"),
	e("aws", "AWS / Bedrock", "Cloud", "existing_cli", []string{"aws"}, []string{"AWS_PROFILE", "AWS_REGION"}, []string{".aws"}, "cost", "quota"),
	e("azure", "Azure / Azure OpenAI", "Cloud", "existing_cli", []string{"az"}, []string{"AZURE_SUBSCRIPTION_ID", "AZURE_OPENAI_ENDPOINT"}, []string{".azure"}, "cost", "quota", "api_usage"),
	e("gcp", "Google Cloud", "Cloud", "existing_cli", []string{"gcloud"}, []string{"GOOGLE_CLOUD_PROJECT", "CLOUDSDK_CONFIG"}, []string{".config/gcloud"}, "cost", "quota"),
	e("oracle", "Oracle Cloud", "Cloud", "existing_cli", []string{"oci"}, []string{"OCI_CLI_PROFILE"}, []string{".oci"}, "cost", "quota"),
	e("digitalocean", "DigitalOcean", "Cloud", "existing_cli", []string{"doctl"}, []string{"DIGITALOCEAN_ACCESS_TOKEN"}, []string{".config/doctl"}, "billing", "quota"),
	e("vercel", "Vercel", "Developer platform", "existing_cli", []string{"vercel"}, []string{"VERCEL_TOKEN", "VERCEL_ORG_ID"}, []string{".config/vercel"}, "billing", "usage"),
	e("railway", "Railway", "Developer platform", "existing_cli", []string{"railway"}, []string{"RAILWAY_TOKEN"}, []string{".railway"}, "billing", "usage"),
	e("netlify", "Netlify", "Developer platform", "existing_cli", []string{"netlify"}, []string{"NETLIFY_AUTH_TOKEN"}, []string{".netlify"}, "billing", "usage"),
	e("cloudflare", "Cloudflare", "Developer platform", "existing_cli", []string{"wrangler"}, []string{"CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"}, []string{".wrangler"}, "activity"),
	e("gitlab", "GitLab", "Developer platform", "existing_cli", []string{"gitlab", "glab"}, []string{"GITLAB_TOKEN"}, []string{".config/glab"}, "billing", "usage"),
	e("circleci", "CircleCI", "Developer platform", "existing_cli", []string{"circleci"}, []string{"CIRCLECI_TOKEN"}, []string{".circleci"}, "usage"),
	e("fly", "Fly.io", "Developer platform", "existing_cli", []string{"flyctl"}, []string{"FLY_API_TOKEN"}, []string{".fly"}, "billing", "usage"),
	e("heroku", "Heroku", "Developer platform", "existing_cli", []string{"heroku"}, []string{"HEROKU_API_KEY"}, []string{".config/heroku"}, "billing", "usage"),
	e("openrouter", "OpenRouter", "AI platform", "api_key", nil, []string{"OPENROUTER_API_KEY"}, nil, "balance", "api_usage"),
	e("groq", "Groq", "AI platform", "api_key", nil, []string{"GROQ_API_KEY"}, nil, "api_usage"),
	e("mistral", "Mistral", "AI platform", "api_key", nil, []string{"MISTRAL_API_KEY"}, nil, "api_usage"),
	e("deepseek", "DeepSeek", "AI platform", "api_key", nil, []string{"DEEPSEEK_API_KEY"}, nil, "balance", "api_usage"),
	e("xai", "xAI / Grok", "AI platform", "api_key", nil, []string{"XAI_API_KEY"}, nil, "api_usage"),
	e("together", "Together AI", "AI platform", "api_key", nil, []string{"TOGETHER_API_KEY"}, nil, "billing", "api_usage"),
	e("fireworks", "Fireworks AI", "AI platform", "api_key", nil, []string{"FIREWORKS_API_KEY"}, nil, "billing", "api_usage"),
	e("cerebras", "Cerebras", "AI platform", "api_key", nil, []string{"CEREBRAS_API_KEY"}, nil, "api_usage"),
	e("cohere", "Cohere", "AI platform", "api_key", nil, []string{"COHERE_API_KEY"}, nil, "api_usage"),
	e("elevenlabs", "ElevenLabs", "AI platform", "api_key", nil, []string{"ELEVENLABS_API_KEY"}, nil, "quota", "api_usage"),
	e("deepgram", "Deepgram", "AI platform", "api_key", nil, []string{"DEEPGRAM_API_KEY"}, nil, "balance", "api_usage"),
	e("datadog", "Datadog", "Observability", "api_key", nil, []string{"DD_API_KEY", "DD_APP_KEY"}, nil, "usage"),
	e("sentry", "Sentry", "Observability", "api_key", []string{"sentry-cli"}, []string{"SENTRY_AUTH_TOKEN", "SENTRY_ORG"}, []string{".sentryclirc"}, "usage"),
	e("grafana", "Grafana Cloud", "Observability", "api_key", nil, []string{"GRAFANA_API_KEY"}, nil, "usage"),
	e("supabase", "Supabase", "Data", "existing_cli", []string{"supabase"}, []string{"SUPABASE_ACCESS_TOKEN"}, []string{".supabase"}, "usage"),
	e("neon", "Neon", "Data", "api_key", nil, []string{"NEON_API_KEY"}, nil, "usage"),
	e("snowflake", "Snowflake", "Data", "existing_cli", []string{"snow", "snowsql"}, []string{"SNOWFLAKE_ACCOUNT"}, []string{".snowflake"}, "usage"),
	e("aggregators", "Installed usage aggregators", "Aggregator", "installed_source", []string{"codexbar", "openusage", "openquota", "onwatch"}, nil, nil, "multi_provider"),
}

func init() {
	for _, v := range []struct{ id, name, executable string }{
		{"antigravity", "Antigravity", "antigravity"}, {"opencode", "OpenCode", "opencode"}, {"kiro", "Kiro", "kiro"},
		{"windsurf", "Windsurf", "windsurf"}, {"zed", "Zed", "zed"}, {"jetbrains-ai", "JetBrains AI", "jetbrains"},
		{"amp", "Amp", "amp"}, {"devin", "Devin", "devin"}, {"factory", "Factory", "droid"}, {"augment", "Augment", "augment"},
		{"warp", "Warp", "warp"}, {"kilo", "Kilo Code", "kilo"}, {"codebuff", "Codebuff", "codebuff"}, {"roo", "Roo Code", "roo"},
		{"goose", "Goose", "goose"}, {"crush", "Crush", "crush"}, {"hermes", "Hermes", "hermes"},
	} {
		tierA = append(tierA, e(v.id, v.name, "AI coding", "existing_cli", []string{v.executable}, nil, nil, "detection", "local_activity"))
	}
	for _, v := range []struct{ id, name, env string }{
		{"zai", "Z.AI", "ZAI_API_KEY"}, {"moonshot", "Moonshot / Kimi", "MOONSHOT_API_KEY"}, {"minimax", "MiniMax", "MINIMAX_API_KEY"},
		{"alibaba", "Alibaba Cloud AI", "DASHSCOPE_API_KEY"}, {"synthetic", "Synthetic", "SYNTHETIC_API_KEY"}, {"perplexity", "Perplexity", "PERPLEXITY_API_KEY"},
		{"poe", "Poe", "POE_API_KEY"}, {"venice", "Venice AI", "VENICE_API_KEY"}, {"chutes", "Chutes", "CHUTES_API_KEY"}, {"opencode-zen", "OpenCode Zen", "OPENCODE_API_KEY"},
		{"newrelic", "New Relic", "NEW_RELIC_API_KEY"}, {"mongodb", "MongoDB Atlas", "MONGODB_ATLAS_PUBLIC_KEY"}, {"planetscale", "PlanetScale", "PLANETSCALE_SERVICE_TOKEN"},
		{"upstash", "Upstash", "UPSTASH_API_KEY"}, {"redis-cloud", "Redis Cloud", "REDISCLOUD_ACCESS_KEY"}, {"aiven", "Aiven", "AIVEN_TOKEN"}, {"confluent", "Confluent Cloud", "CONFLUENT_CLOUD_API_KEY"},
	} {
		tierA = append(tierA, e(v.id, v.name, "API and data", "api_key", nil, []string{v.env}, nil, "usage"))
	}
}

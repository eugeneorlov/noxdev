export interface GlobalConfig {
  accounts: {
    max: {
      preferred: boolean;
      rate_limit_ceiling: number;
    };
    api: {
      fallback: boolean;
      daily_cap_usd: number;
      model: string;
    };
    gemini: {
      fallback: boolean;
      model: string;
    };
  };
  safety: {
    auto_push: boolean;
    max_retries_per_task: number;
    circuit_breaker_threshold: number;
  };
  secrets: {
    provider: string;
    global: string;
    age_key: string;
  };
}

export interface ProjectConfig {
  project: string;
  display_name: string;
  test_command: string;
  build_command: string;
  lint_command: string;
  docker: {
    memory: string;
    cpus: number;
    timeout_minutes: number;
  };
  secrets: string;
  tasks_file: string;
  critic_default: string;
  push_default: string;
}

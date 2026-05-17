export type TransportKind = 'stdio' | 'streamable-http' | 'sse';

export interface RegistryBackend {
  description?: string;
  transport: TransportKind;
  disabled?: boolean;
  always_on?: boolean;
  endpoint?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env_passthrough?: string[];
  idle_timeout_seconds?: number;
  call_timeout_seconds?: number;
  tools_cache?: string[];
}

export interface Registry {
  _comment?: string;
  _settings?: {
    exposePassthroughTools?: boolean;
  };
  [backendName: string]: RegistryBackend | Registry['_settings'] | string | undefined;
}

export interface AuditEvent {
  ts?: string;
  action: string;
  backend?: string;
  tool?: string;
  reason?: string;
  transport?: TransportKind;
  tools?: number;
  timeout_seconds?: number;
  pid?: number | null;
}

export interface MeasurementReport {
  baseline: {
    mcpServers: number;
    tools: number;
    estimatedTokens: number;
    mcpEstimatedTokens: number;
    skills: number;
    skillsEstimatedTokens: number;
  };
  governor: {
    mcpEntries: number;
    registeredBackends: number;
    enabledBackends: number;
    tools: number;
    estimatedTokens: number;
    mcpEstimatedTokens: number;
    activeSkills: number;
    skillsEstimatedTokens: number;
  };
}

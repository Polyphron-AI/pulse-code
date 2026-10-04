export interface ProviderResolvedSkill {
  readonly id?: string;
  readonly name: string;
  readonly path: string;
  readonly directory?: string;
  readonly revision?: string;
  readonly userInvocationOnly?: boolean;
}

export type ProviderManagedMcpServer =
  | {
      readonly id: string;
      readonly name: string;
      readonly transport: "http";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    }
  | {
      readonly id: string;
      readonly name: string;
      readonly transport: "stdio";
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly cwd?: string;
      readonly env: Readonly<Record<string, string>>;
    };

export interface ProviderManagedMcpStatus {
  readonly id: string;
  readonly status: "ready" | "unknown" | "failed";
  readonly message?: string;
}
export interface ProviderNativeMcpStatus {
  readonly name: string;
  readonly status: "ready" | "unknown" | "failed" | "auth-required";
}

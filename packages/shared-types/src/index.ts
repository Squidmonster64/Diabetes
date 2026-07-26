export type GlucoseUnit = "MMOL_L" | "MG_DL";

export interface RequestContext {
  readonly requestId: string;
  readonly patientId: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

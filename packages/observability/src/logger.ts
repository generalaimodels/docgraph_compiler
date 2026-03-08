export interface Logger {
  debug(fields: Record<string, unknown>): void;
  info(fields: Record<string, unknown>): void;
  warn(fields: Record<string, unknown>): void;
  error(fields: Record<string, unknown>): void;
}

function emit(level: string, fields: Record<string, unknown>): void {
  const record = {
    level,
    timestamp: new Date().toISOString(),
    ...fields
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(record));
}

export function createLogger(namespace: string): Logger {
  return {
    debug(fields) {
      emit("debug", { namespace, ...fields });
    },
    info(fields) {
      emit("info", { namespace, ...fields });
    },
    warn(fields) {
      emit("warn", { namespace, ...fields });
    },
    error(fields) {
      emit("error", { namespace, ...fields });
    }
  };
}

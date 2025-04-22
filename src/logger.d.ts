declare module "@aurodesignsystem/auro-library/scripts/utils/logger.mjs" {
  export class Logger {
    static success(message: string | string[], section = false): void;
    static error(
      message: string | string[] | unknown | Error,
      section = false,
    ): void;
    static warn(message: string | string[], section = false): void;
    static info(message: string | string[], section = false): void;
  }
}

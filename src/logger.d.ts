declare module "@aurodesignsystem/auro-library/scripts/utils/logger.mjs" {
  export class Logger {
    static success(message: any, section: boolean = false): void;
    static error(message: any, section: boolean = false): void;
    static warn(message: any, section: boolean = false): void;
    static info(message: any, section: boolean = false): void;
  }
}

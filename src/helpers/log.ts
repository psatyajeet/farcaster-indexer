import { ILogObj, Logger } from 'tslog';

enum LOG_LEVEL {
  SILLY = 0,
  TRACE = 1,
  DEBUG = 2,
  INFO = 3,
  WARN = 4,
  ERROR = 5,
  FATAL = 6,
}

/*
Minimum log level to be captured by this logger. Possible values are: silly, trace, debug, info, warn, error, fatal
*/
const logLevel = LOG_LEVEL.INFO;

// https://github.com/fullstack-build/tslog
const log: Logger<ILogObj> = new Logger({ minLevel: logLevel });
export default log;

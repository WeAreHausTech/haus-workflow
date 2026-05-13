export const log = (msg?: unknown, ...args: unknown[]): void => {
  console.log(msg, ...args); // eslint-disable-line no-console
};

export const warn = (msg?: unknown, ...args: unknown[]): void => {
  console.warn(msg, ...args); // eslint-disable-line no-console
};

export const error = (msg?: unknown, ...args: unknown[]): void => {
  console.error(msg, ...args); // eslint-disable-line no-console
};

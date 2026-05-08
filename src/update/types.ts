export type LockfileItem = {
  id: string;
  type: string;
  source: string;
  version: string;
  hash: string;
  installMode: string;
  paths: string[];
};

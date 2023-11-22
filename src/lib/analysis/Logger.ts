import { mkdir, writeFile } from "fs/promises";
import path from "path";

interface Logfile {
  name: string;
  payload: string;
}

export class Logger {
  private logfiles: Logfile[] = [];

  constructor(readonly outputBasePath: string) {}

  addLogfile(name: string, payload: string): void {
    this.logfiles = [...this.logfiles, { name, payload }];
  }

  async persist(): Promise<void> {
    await mkdir(this.outputBasePath, { recursive: true });
    for (const logfile of this.logfiles) {
      await writeFile(
        path.join(this.outputBasePath, `${logfile.name}.json`),
        logfile.payload
      );
    }
  }
}

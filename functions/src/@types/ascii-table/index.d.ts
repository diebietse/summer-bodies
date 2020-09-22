declare module "ascii-table" {
  class AsciiTable {
    constructor();
    setHeading(...row: string[]): void;
    addRow(...row: string[]): void;
    toString(): string;
  }
  export = AsciiTable;
}

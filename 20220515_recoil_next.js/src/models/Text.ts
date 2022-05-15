import Copyable from "utils/Copyable"

export default class Text extends Copyable<Text> {
  readonly length: number
  constructor(
    readonly value: string,
  ) {
    super();
    this.length = this.value.length;
  }
}

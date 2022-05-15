import Copyable from "utils/Copyable"

export default class Text extends Copyable<Text> {
  constructor(
    readonly value: string,
  ) {
    super();
  }

  length(): number {
    return this.value.length;
  }
}

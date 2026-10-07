/** Window-native drag events only describe files after a nonempty enter/drop. */
export class NativeFileDragSession {
  #active = false;
  update(payload: { type: string; paths?: readonly string[] }): boolean {
    if (payload.type === 'enter') this.#active = Boolean(payload.paths?.length);
    else if (payload.type !== 'over') this.#active = false;
    return this.#active;
  }
}

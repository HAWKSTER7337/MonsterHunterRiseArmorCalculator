/** A single decoration slot on a piece of equipment. Holds a decoration id, or null when empty. */
export class DecorationSocket {
  constructor(slotLevel, decorationId = null) {
    this.slotLevel = slotLevel;
    this.decorationId = decorationId;
  }

  canHold(decoration) {
    return decoration.slotLevel <= this.slotLevel;
  }

  insert(decoration) {
    if (!this.canHold(decoration)) {
      throw new Error(`${decoration.name} (level ${decoration.slotLevel}) does not fit a level ${this.slotLevel} slot`);
    }
    this.decorationId = decoration.id;
  }

  clear() {
    this.decorationId = null;
  }

  static fromSlotLevels(slotLevels) {
    return slotLevels.map((slotLevel) => new DecorationSocket(slotLevel));
  }

  /** Re-applies saved decoration ids onto fresh sockets, dropping any that no longer fit. */
  static restoreDecorations(sockets, savedDecorationIds, lookupDecoration) {
    sockets.forEach((socket, socketIndex) => {
      const decoration = lookupDecoration(savedDecorationIds?.[socketIndex]);
      if (decoration && socket.canHold(decoration)) {
        socket.insert(decoration);
      }
    });
  }
}

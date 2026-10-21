const object = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input);
const MAX_ARGUMENT_BYTES = 1_048_576;

/** Conservative receipt validation only. It changes neither wire output nor tool permission. */
export class StreamDeliveryWitness {
  private started = false;
  private stopped = false;
  private nextIndex = 0;
  private active: { index: number; type: string; id?: string; name?: string; input?: Record<string, unknown>; json: string } | undefined;
  private sawMessageDelta = false;
  invalid = false;

  observe(value: unknown): { toolUseId?: unknown; completedTool?: { id: string; name: string; input: Record<string, unknown> } } {
    if (!object(value) || typeof value.type !== 'string') { this.invalid = true; return {}; }
    if (value.type === 'ping') return {};
    if (this.stopped) { this.invalid = true; return {}; }
    if (value.type === 'message_start') {
      if (this.started || !object(value.message) || !Array.isArray(value.message.content) || value.message.content.length) this.invalid = true;
      this.started = true;
      return {};
    }
    if (!this.started) this.invalid = true;
    if (value.type === 'content_block_start') {
      const block = value.content_block;
      if (this.active || this.sawMessageDelta || !Number.isSafeInteger(value.index) || value.index !== this.nextIndex
        || !object(block) || !['text', 'thinking', 'tool_use'].includes(String(block.type))) {
        this.invalid = true;
        return {};
      }
      if ((block.type === 'text' && typeof block.text !== 'string')
        || (block.type === 'thinking' && typeof block.thinking !== 'string')
        || (block.type === 'tool_use' && (typeof block.id !== 'string' || !block.id || block.id.length > 256
          || typeof block.name !== 'string' || !block.name || block.name.length > 256 || !object(block.input)))) this.invalid = true;
      this.active = { index: value.index as number, type: block.type as string, json: '',
        id: block.id as string, name: block.name as string, input: block.input as Record<string, unknown> };
      return block.type === 'tool_use' ? { toolUseId: block.id } : {};
    }
    if (value.type === 'content_block_delta') {
      const delta = value.delta;
      const allowed = this.active?.type === 'text' ? ['text_delta']
        : this.active?.type === 'thinking' ? ['thinking_delta', 'signature_delta'] : ['input_json_delta'];
      if (!this.active || this.active.index !== value.index || !object(delta) || !allowed.includes(String(delta.type))) {
        this.invalid = true; return {};
      }
      const data = delta.type === 'text_delta' ? delta.text : delta.type === 'thinking_delta' ? delta.thinking
        : delta.type === 'signature_delta' ? delta.signature : delta.partial_json;
      if (typeof data !== 'string') { this.invalid = true; return {}; }
      if (delta.type === 'input_json_delta') {
        if (Buffer.byteLength(this.active.json) + Buffer.byteLength(data) > MAX_ARGUMENT_BYTES
          || Object.keys(this.active.input ?? {}).length !== 0) this.invalid = true;
        else this.active.json += data;
      }
      return {};
    }
    if (value.type === 'content_block_stop') {
      const block = this.active;
      if (!block || block.index !== value.index) this.invalid = true;
      this.active = undefined;
      this.nextIndex++;
      if (!this.invalid && block?.type === 'tool_use') {
        try {
          const input: unknown = block.json ? JSON.parse(block.json) : block.input;
          if (!object(input)) { this.invalid = true; return {}; }
          return { completedTool: { id: block.id!, name: block.name!, input } };
        } catch { this.invalid = true; }
      }
      return {};
    }
    if (value.type === 'message_delta') {
      if (this.active || this.sawMessageDelta || !object(value.delta)) this.invalid = true;
      this.sawMessageDelta = true;
      return {};
    }
    if (value.type === 'message_stop') {
      if (this.active || !this.sawMessageDelta) this.invalid = true;
      this.stopped = true;
      return {};
    }
    this.invalid = true;
    return {};
  }
}

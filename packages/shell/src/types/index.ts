import type { ChannelName, EventName, RequestOf, ResponseOf, EventOf } from '@word/ipc-schema';

type DisposeFunction = () => void;
type EventCallback<E extends EventName> = (payload: EventOf<E>) => void;

/**
 * The surface exposed to the renderer via contextBridge as `window.wordAPI`.
 * @word/app declares `window.wordAPI: WordApi` using this type.
 */
export interface WordApi {
  invoke<C extends ChannelName>(channel: C, req: RequestOf<C>): Promise<ResponseOf<C>>;
  on<E extends EventName>(event: E, cb: EventCallback<E>): DisposeFunction;
  off<E extends EventName>(event: E, cb: EventCallback<E>): void;
}

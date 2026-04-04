import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId: number | null;
  userName: string | null;
  ip: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getContext = (): RequestContext => {
  return requestContext.getStore() ?? { userId: null, userName: null, ip: null };
};

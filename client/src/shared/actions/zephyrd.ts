import { zephyrdProxy } from "shared/core/proxy";
import { DAEMON_CONECTION_CREATED } from "./types";
import { getNodeForWallet } from "./walletCreation";

export const connectAppToDaemon = () => {
  return async (dispatch: any, getState: any) => {
    const node = getNodeForWallet(getState);
    if (!node) return;

    try {
      await zephyrdProxy.createDaemonConnection(node);
      dispatch({ type: DAEMON_CONECTION_CREATED });
    } catch (e) {
      // An unreachable node must not abort the wallet session; the wallet
      // reports its own connection state.
      console.log("connectAppToDaemon error: ", e);
    }
  };
};

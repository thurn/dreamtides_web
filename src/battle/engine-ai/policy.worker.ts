// The Web Worker that runs the AI's policies off the main thread
// (engine-design § Policy interface). Its protocol is
// src/engine/policy/worker-protocol.ts.
import {
  createPolicyWorkerHandler,
  type PolicyWorkerMessage,
  type PolicyWorkerReply,
} from "../../engine/policy/worker-protocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<PolicyWorkerMessage>) => void) | null;
  postMessage(reply: PolicyWorkerReply): void;
}

const scope = globalThis as unknown as WorkerScope;
const handle = createPolicyWorkerHandler(() => performance.now());

scope.onmessage = (event) => {
  const reply = handle(event.data);
  if (reply !== null) scope.postMessage(reply);
};

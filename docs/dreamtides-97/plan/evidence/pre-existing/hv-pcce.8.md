# Pre-existing issues found by hv-pcce.8

- **A card-choice quest turn-in skips the giver's completion node.** Turning
  in the last sheaf (`completeQuest`, card-choice reward) opens the quest
  reward panel; after the pick, the conversation reopens on the dialogue's
  first entry that holds (the quest's completed line) instead of the
  choice's `next` node, so Hessa's completion lines (node `7a586366-…`) never
  show. The Essence turn-in at the reeve shows its `next` node as written.
  Seen in `artifacts/qa/hv-pcce.8/invocations/run-p4muok/revision.result.json`
  (`hessaThanks` is node `5de5b552-…`). The conversation's position is view
  state in `src/screens/cumulus_adapters/d97/D97ConversationAdapter.tsx`,
  which reopens on `openingNode` when it mounts again after the panel.
- **Browser QA run while `npm run review` is restoring assets** shows the
  dream-unavailable surface (`d97_dream_unavailable`, reason `unavailable`),
  as hv-pcce.16 recorded; preparing the workspace again before the run
  plays the dream.

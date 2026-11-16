# n8n-nodes-storkai

An [n8n](https://n8n.io) community node for the [Stork API](https://www.stork.ai/developers).
It makes three things inside a workflow:

- **Talking Photo**: one photo says your text, or lip-syncs your own audio. Returns an MP4.
- **Speech**: text to an MP3 voiceover in a built-in voice.
- **Singing Video**: one photo performs a song, filmed from several camera angles. Returns an MP4.

## Installation

In n8n, open **Settings > Community Nodes > Install** and enter `n8n-nodes-storkai`.
See the [n8n guide to community nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

1. Create an account at [stork.ai](https://www.stork.ai) and open [Dashboard > API](https://www.stork.ai/dashboard/api).
2. Create a key. It starts with `sk_stork_` and is shown once.
3. In n8n, add a **Stork AI API** credential and paste the key.

Talking Photo and Speech have a free tier that needs no credits (free videos carry a
Stork logo). Paid jobs and every Singing Video are paid from prepaid Stork credits:
1 credit is 1 US cent. Current prices are on the [developer pages](https://www.stork.ai/developers).

## Operations

Each of the three resources has the same four operations:

| Operation | What it does |
| --- | --- |
| Create | Starts a job. By default the node waits and returns the finished file's address. |
| Estimate | Returns the price of a job without making it. |
| Get | Returns one job by its ID. |
| Get Many | Returns recent jobs, newest first. |

### Waiting

**Create** waits for the result by default. A talking photo or a voiceover is usually
ready in a minute or two. A singing video is slow: about 8 minutes for 15 seconds
of video and half an hour or more for a whole song. For long jobs, turn off
**Wait for Completion**, pass a **Webhook URL** that points at an n8n Webhook node,
and continue the workflow from there. Stork signs each webhook; the signing
secret and the check are described in the [API docs](https://www.stork.ai/developers).

A job that fails is not charged.

## Example workflow

1. **Manual Trigger**
2. **Stork AI**: Resource *Speech*, Operation *Create*, Text `Welcome back to the channel.`, Voice ID `en-ava`, Tier *Free*. The output has `audio_url`.
3. **Stork AI**: Resource *Talking Photo*, Operation *Create*, Photo URL of a portrait, Voice From *Audio File*, Audio URL `{{ $json.audio_url }}`, Tier *Free*. The output has `video_url`.

## Compatibility

Built with the current `@n8n/node-cli`. Needs an n8n version that supports community nodes (1.0 or later).

## Resources

- [Stork API docs](https://www.stork.ai/developers) and the same docs [as Markdown](https://www.stork.ai/developers.md)
- [OpenAPI file](https://api.stork.ai/api/v1/openapi.json)
- [Voices](https://api.stork.ai/api/v1/voices)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)

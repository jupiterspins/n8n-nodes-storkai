import { randomUUID } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

const BASE_URL = 'https://api.stork.ai/api/v1';

type Resource = 'talkingPhoto' | 'speech' | 'singingVideo';

// Path, the statuses that end a job, and how often to ask while waiting.
const RESOURCES: Record<
	Resource,
	{ path: string; ok: string[]; failed: string[]; pollSeconds: number }
> = {
	talkingPhoto: { path: '/talking-photo', ok: ['succeeded'], failed: ['failed'], pollSeconds: 10 },
	speech: { path: '/speech', ok: ['done'], failed: ['failed', 'stopped'], pollSeconds: 5 },
	singingVideo: { path: '/singing-video', ok: ['succeeded'], failed: ['failed'], pollSeconds: 60 },
};

async function storkRequest(
	ctx: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		json: true,
		qs,
		body,
	};
	if (method === 'POST') {
		// A retried request with the same key never makes or charges for a second job.
		options.headers = { 'Idempotency-Key': randomUUID() };
	}
	try {
		return (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			'storkAiApi',
			options,
		)) as IDataObject;
	} catch (error) {
		// Prefer the API's own message ("Not enough credits ...") over the generic one for the status code.
		const e = error as {
			response?: { data?: { error?: IDataObject }; body?: { error?: IDataObject } };
		};
		const api = e.response?.data?.error ?? e.response?.body?.error;
		if (api?.message) {
			throw new NodeApiError(ctx.getNode(), error as JsonObject, {
				message: String(api.message),
				description: api.code ? `Stork error code: ${String(api.code)}` : undefined,
			});
		}
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

export class StorkAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Stork AI',
		name: 'storkAi',
		icon: { light: 'file:../../icons/storkai.svg', dark: 'file:../../icons/storkai.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Make talking photo videos, voiceovers and singing videos with the Stork API',
		defaults: {
			name: 'Stork AI',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'storkAiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Singing Video',
						value: 'singingVideo',
						description: 'One photo performs a song, filmed from several camera angles',
					},
					{
						name: 'Speech',
						value: 'speech',
						description: 'Text to an MP3 voiceover',
					},
					{
						name: 'Talking Photo',
						value: 'talkingPhoto',
						description: 'One photo says your text or lip-syncs your audio',
					},
				],
				default: 'talkingPhoto',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Start a job and, by default, wait for the finished file',
						action: 'Create a video or voiceover',
					},
					{
						name: 'Estimate',
						value: 'estimate',
						description: 'Get the price of a job without making it',
						action: 'Estimate the price of a job',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get one job by its ID',
						action: 'Get a job',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get recent jobs, newest first',
						action: 'Get many jobs',
					},
				],
				default: 'create',
			},

			// ---- Get ----
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { operation: ['get'] } },
				description: 'The ID returned when the job was created',
			},

			// ---- Get Many ----
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				displayOptions: { show: { operation: ['getAll'] } },
				description: 'Max number of results to return',
			},

			// ---- Talking photo and singing video: the photo ----
			{
				displayName: 'Photo URL',
				name: 'imageUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/portrait.jpg',
				displayOptions: {
					show: { resource: ['talkingPhoto', 'singingVideo'], operation: ['create'] },
				},
				description: 'Public HTTPS address of a photo with one clear face',
			},

			// ---- Talking photo: what it says ----
			{
				displayName: 'Voice From',
				name: 'voiceSource',
				type: 'options',
				options: [
					{
						name: 'Text',
						value: 'text',
						description: 'Stork speaks your text in a built-in voice',
					},
					{
						name: 'Audio File',
						value: 'audio',
						description: 'The photo lip-syncs to your own recording',
					},
				],
				default: 'text',
				displayOptions: { show: { resource: ['talkingPhoto'], operation: ['create', 'estimate'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['talkingPhoto'],
						operation: ['create', 'estimate'],
						voiceSource: ['text'],
					},
				},
				description: 'What the person in the photo says',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				displayOptions: { show: { resource: ['speech'], operation: ['create', 'estimate'] } },
				description: 'What the voice says, in the language of the voice',
			},
			{
				displayName: 'Voice ID',
				name: 'voiceId',
				type: 'string',
				required: true,
				default: 'en-leo',
				displayOptions: {
					show: {
						resource: ['talkingPhoto'],
						operation: ['create', 'estimate'],
						voiceSource: ['text'],
					},
				},
				description:
					'A built-in voice such as en-leo or en-ava. The full list is at https://api.stork.ai/api/v1/voices.',
			},
			{
				displayName: 'Voice ID',
				name: 'voiceId',
				type: 'string',
				required: true,
				default: 'en-ava',
				displayOptions: { show: { resource: ['speech'], operation: ['create', 'estimate'] } },
				description:
					'A built-in voice such as en-ava or en-leo. The full list is at https://api.stork.ai/api/v1/voices.',
			},
			{
				displayName: 'Audio URL',
				name: 'audioUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/voice.mp3',
				displayOptions: {
					show: { resource: ['talkingPhoto'], operation: ['create'], voiceSource: ['audio'] },
				},
				description: 'Public HTTPS address of the recording (MP3, WAV, M4A, OGG or WebM)',
			},
			{
				displayName: 'Audio Length (Seconds)',
				name: 'estimateSeconds',
				type: 'number',
				typeOptions: { minValue: 1 },
				required: true,
				default: 30,
				displayOptions: {
					show: { resource: ['talkingPhoto'], operation: ['estimate'], voiceSource: ['audio'] },
				},
				description: 'Length of the recording you plan to send',
			},

			// ---- Singing video ----
			{
				displayName: 'Song URL',
				name: 'audioUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/song.mp3',
				displayOptions: { show: { resource: ['singingVideo'], operation: ['create'] } },
				description: 'Public HTTPS address of the song, at least 15 seconds long',
			},
			{
				displayName: 'Length (Seconds)',
				name: 'seconds',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				displayOptions: { show: { resource: ['singingVideo'], operation: ['create'] } },
				description: 'Length of video to make from the start of the song, 15 to 330. Use 0 for the whole song.',
			},
			{
				displayName: 'Length (Seconds)',
				name: 'estimateSeconds',
				type: 'number',
				typeOptions: { minValue: 15 },
				required: true,
				default: 15,
				displayOptions: { show: { resource: ['singingVideo'], operation: ['estimate'] } },
				description: 'Length of video to price, 15 to 330',
			},

			// ---- Tier ----
			{
				displayName: 'Tier',
				name: 'tier',
				type: 'options',
				options: [
					{
						name: 'Free',
						value: 'free',
						description: 'A small daily allowance. Videos carry a Stork logo.',
					},
					{
						name: 'Paid',
						value: 'paid',
						description: 'Paid from your Stork credits. No logo.',
					},
				],
				default: 'free',
				displayOptions: {
					show: { resource: ['talkingPhoto', 'speech'], operation: ['create', 'estimate'] },
				},
			},

			// ---- Waiting ----
			{
				displayName: 'Wait for Completion',
				name: 'wait',
				type: 'boolean',
				default: true,
				displayOptions: { show: { operation: ['create'] } },
				description:
					'Whether to wait until the file is ready and return its address. Turn off to return the job ID at once.',
			},
			{
				displayName: 'Give Up After (Minutes)',
				name: 'maxWaitMinutes',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 20,
				displayOptions: { show: { operation: ['create'], wait: [true] } },
				description:
					'How long to wait before the node fails. The job itself keeps running. A singing video can take 75 minutes.',
			},

			// ---- Options ----
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['talkingPhoto'], operation: ['create', 'estimate'] } },
				options: [
					{
						displayName: 'Aspect Ratio',
						name: 'aspect_ratio',
						type: 'options',
						options: [
							{ name: 'Landscape (16:9)', value: '16:9' },
							{ name: 'Portrait (9:16)', value: '9:16' },
							{ name: 'Square (1:1)', value: '1:1' },
						],
						default: '9:16',
					},
					{
						displayName: 'Quality',
						name: 'quality',
						type: 'options',
						options: [
							{ name: 'Standard', value: 'standard' },
							{ name: 'Pro', value: 'pro' },
						],
						default: 'standard',
						description: 'Paid tier only',
					},
					{
						displayName: 'Resolution',
						name: 'resolution',
						type: 'options',
						options: [
							{ name: '480p', value: '480p' },
							{ name: '720p', value: '720p' },
						],
						default: '480p',
						description: 'Paid tier only',
					},
				],
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'https://your-n8n.example.com/webhook/stork',
				displayOptions: { show: { operation: ['create'] } },
				description:
					'Optional. Stork sends a signed POST to this HTTPS address when the job finishes. Use it with a Webhook node and turn off Wait for Completion.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as Resource;
				const operation = this.getNodeParameter('operation', i) as string;
				const r = RESOURCES[resource];

				if (operation === 'get') {
					const id = this.getNodeParameter('jobId', i) as string;
					const job = await storkRequest(this, 'GET', r.path, undefined, { id });
					out.push({ json: job, pairedItem: i });
					continue;
				}

				if (operation === 'getAll') {
					const limit = this.getNodeParameter('limit', i) as number;
					const res = await storkRequest(this, 'GET', r.path, undefined, { limit });
					const rows = Array.isArray(res.data) ? (res.data as IDataObject[]) : [];
					for (const row of rows) out.push({ json: row, pairedItem: i });
					continue;
				}

				// Create and Estimate share most of their body.
				const body: IDataObject = {};
				if (resource === 'talkingPhoto') {
					const source = this.getNodeParameter('voiceSource', i) as string;
					if (source === 'text') {
						body.text = this.getNodeParameter('text', i) as string;
						body.voice_id = this.getNodeParameter('voiceId', i) as string;
					} else if (operation === 'estimate') {
						body.seconds = this.getNodeParameter('estimateSeconds', i) as number;
					} else {
						body.audio_url = this.getNodeParameter('audioUrl', i) as string;
					}
					body.tier = this.getNodeParameter('tier', i) as string;
					Object.assign(body, this.getNodeParameter('additionalFields', i, {}) as IDataObject);
				} else if (resource === 'speech') {
					body.text = this.getNodeParameter('text', i) as string;
					body.voice_id = this.getNodeParameter('voiceId', i) as string;
					body.tier = this.getNodeParameter('tier', i) as string;
				} else if (operation === 'estimate') {
					body.seconds = this.getNodeParameter('estimateSeconds', i) as number;
				} else {
					body.audio_url = this.getNodeParameter('audioUrl', i) as string;
					const seconds = this.getNodeParameter('seconds', i, 0) as number;
					if (seconds > 0) body.seconds = seconds;
				}

				if (operation === 'estimate') {
					const price = await storkRequest(this, 'POST', `${r.path}/estimate`, body);
					out.push({ json: price, pairedItem: i });
					continue;
				}

				if (resource !== 'speech') body.image_url = this.getNodeParameter('imageUrl', i) as string;
				const webhookUrl = this.getNodeParameter('webhookUrl', i, '') as string;
				if (webhookUrl) body.webhook_url = webhookUrl;

				let job = await storkRequest(this, 'POST', r.path, body);
				if (!(this.getNodeParameter('wait', i, true) as boolean)) {
					out.push({ json: job, pairedItem: i });
					continue;
				}

				const id = String(job.id);
				const deadline = Date.now() + (this.getNodeParameter('maxWaitMinutes', i, 20) as number) * 60_000;
				for (;;) {
					const status = String(job.status);
					if (r.ok.includes(status)) break;
					if (r.failed.includes(status)) {
						throw new NodeOperationError(
							this.getNode(),
							`Stork job ${id} ${status}: ${String(job.error ?? 'no reason given')}. Nothing was charged.`,
							{ itemIndex: i },
						);
					}
					if (Date.now() > deadline) {
						throw new NodeOperationError(
							this.getNode(),
							`Stork job ${id} was still ${status} when this node stopped waiting. It keeps running: read it later with the Get operation.`,
							{ itemIndex: i },
						);
					}
					await sleep(r.pollSeconds * 1000);
					job = await storkRequest(this, 'GET', r.path, undefined, { id });
				}
				out.push({ json: job, pairedItem: i });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [out];
	}
}

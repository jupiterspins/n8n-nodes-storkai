import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class StorkAiApi implements ICredentialType {
	name = 'storkAiApi';

	displayName = 'Stork AI API';

	icon: Icon = { light: 'file:../icons/storkai.svg', dark: 'file:../icons/storkai.dark.svg' };

	documentationUrl = 'https://www.stork.ai/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Starts with sk_stork_. Create one at https://www.stork.ai/dashboard/api.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.stork.ai/api/v1',
			url: '/talking-photo',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}

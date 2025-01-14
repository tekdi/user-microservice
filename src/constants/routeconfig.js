{
	routes: [
		{
			sourceRoute: '/interface/v1/account/create',
			type: 'POST',
			priority: 'MUST_HAVE',
			inSequence: false,
			orchestrated: false,
			targetPackages: [
				{
					basePackageName: 'user',
					packageName: 'shiksha-user',
				},
			],
		},
		{
			sourceRoute: '/interface/v1/account/login',
			type: 'POST',
			priority: 'MUST_HAVE',
			inSequence: false,
			orchestrated: false,
			targetPackages: [
				{
					basePackageName: 'user',
					packageName: 'shiksha-user',
				},
			],
		},
	],
}
{
	"routes": [
	  {
		"sourceRoute": "/interface/v1/account/create",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/account/login",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/tenant/create",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/tenant/read",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/tenant/update/:id",
		"type": "PATCH",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohort/create",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohort/update/:id",
		"type": "PUT",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohort/search",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohort/mycohorts/:id",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohort/cohortHierarchy/:id",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohortmember/list",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohortmember/create",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohortmember/read/:id",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohortmember/update/:id",
		"type": "PUT",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/read/:id",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/update/:id",
		"type": "PATCH",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/list",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/auth/login",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  }, 
	  {
		"sourceRoute": "/interface/v1/user/auth/refresh",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/auth/logout",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/auth",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/reset-password",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/forgot-password",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/password-reset-link",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/user/suggestUsername",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/form/read",
		"type": "GET",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/fields/options/read",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/fields/options/delete/:id",
		"type": "DELETE",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/fields/update/:id",
		"type": "PATCH",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/academicyears/list",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/cohortmember/bulkCreate",
		"type": "POST",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  },
	  {
		"sourceRoute": "/interface/v1/fields/values/delete/:id",
		"type": "DELETE",
		"priority": "MUST_HAVE",
		"inSequence": false,
		"orchestrated": false,
		"targetPackages": [
		  {
			"basePackageName": "user",
			"packageName": "shiksha-user"
		  }
		]
	  }
	]
  }
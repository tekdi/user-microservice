export const SHARED_ELASTICSEARCH_CONFIG = {
  indexName: 'users',
  node: process.env.ELASTICSEARCH_HOST || 'http://localhost:9200',
  mappings: {
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        profile: {
          properties: {
            userId: { type: 'keyword' },
            username: { type: 'keyword' },
            firstName: { type: 'text' },
            lastName: { type: 'text' },
            middleName: { type: 'text' },
            email: { type: 'keyword' },
            mobile: { type: 'keyword' },
            mobile_country_code: { type: 'keyword' },
            gender: { type: 'keyword' },
            dob: { type: 'date', null_value: null },
            address: { type: 'text' },
            state: { type: 'keyword' },
            district: { type: 'keyword' },
            country: { type: 'keyword' },
            pincode: { type: 'keyword' },
            status: { type: 'keyword' },
            customFields: {
              type: 'nested',
              properties: {
                fieldId: { type: 'keyword' },
                fieldValuesId: { type: 'keyword' },
                fieldname: { type: 'text' },
                code: { type: 'keyword' },
                label: { type: 'text' },
                type: { type: 'keyword' },
                value: { type: 'text' },
                context: { type: 'keyword' },
                contextType: { type: 'keyword' },
                state: { type: 'keyword' },
                fieldParams: { type: 'object', dynamic: true },
              },
            },
          },
        },
        applications: {
          type: 'nested',
          properties: {
            cohortId: { type: 'keyword' },
            formId: { type: 'keyword' },
            submissionId: { type: 'keyword' },
            cohortmemberstatus: { type: 'keyword' },
            formstatus: { type: 'keyword' },
            completionPercentage: { type: 'float' },
            progress: {
              properties: {
                pages: {
                  type: 'object',
                  properties: {
                    completed: { type: 'boolean' },
                    fields: { type: 'object', dynamic: true },
                  },
                },
                overall: {
                  properties: {
                    completed: { type: 'integer' },
                    total: { type: 'integer' },
                  },
                },
              },
            },
            lastSavedAt: { type: 'date', null_value: null },
            submittedAt: { type: 'date', null_value: null },
            cohortDetails: {
              properties: {
                cohortId: { type: 'keyword' },
                name: { type: 'text' },
                type: { type: 'keyword' },
                status: { type: 'keyword' },
              },
            },
            courses: {
              type: 'nested',
              properties: {
                courseId: { type: 'keyword' },
                courseTitle: { type: 'text' },
                progress: { type: 'float' },
                units: {
                  type: 'nested',
                  properties: {
                    unitId: { type: 'keyword' },
                    unitTitle: { type: 'text' },
                    progress: { type: 'float' },
                    contents: {
                      type: 'nested',
                      properties: {
                        contentId: { type: 'keyword' },
                        type: { type: 'keyword' },
                        title: { type: 'text' },
                        status: { type: 'keyword' },
                        tracking: {
                          properties: {
                            percentComplete: { type: 'float' },
                            lastPosition: { type: 'float' },
                            currentPosition: { type: 'float' },
                            timeSpent: { type: 'integer' },
                            visitedPages: { type: 'integer' },
                            totalPages: { type: 'integer' },
                            lastPage: { type: 'integer' },
                            currentPage: { type: 'integer' },
                            questionsAttempted: { type: 'integer' },
                            totalQuestions: { type: 'integer' },
                            score: { type: 'float' },
                            answers: {
                              type: 'nested',
                              properties: {
                                questionId: { type: 'keyword' },
                                type: { type: 'keyword' },
                                submittedAnswer: { type: 'text' },
                                answer: {
                                  properties: {
                                    answer: { type: 'keyword' },
                                    text: { type: 'text' }
                                  }
                                },
                                text: { type: 'text' },
                                score: { type: 'float' },
                                reviewStatus: { type: 'keyword' }
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        createdAt: { type: 'date', null_value: null },
        updatedAt: { type: 'date', null_value: null },
      },
    },
  },
}; 
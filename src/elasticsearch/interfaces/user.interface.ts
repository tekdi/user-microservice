export interface IApplication {
  cohortId: string;
  formId?: string;
  submissionId?: string;
  cohortmemberstatus?: string;
  formstatus: string;
  completionPercentage?: number;
  lastSavedAt: string;
  submittedAt: string;
  formData?: {
    [pageId: string]: {
      [fieldId: string]: any;
    };
  };
  cohortDetails: {
    cohortId: string;
    name: string;
    type: string;
    status: string;
    [key: string]: any;
  };
  progress: {
    pages: {
      [key: string]: {
        completed: boolean;
        fields: {
          [key: string]: any;
        };
      };
    };
    overall: {
      total: number;
      completed: number;
    };
  };
  courses?: { //new change courses moved to applications
    type: 'nested';
    values: ICourseDetail[];
  };
}

export interface ICourseDetail {
  courseId: string;
  courseTitle: string;
  progress: number;
  units: {
    type: 'nested';
    values: IUnitDetail[];
  };
}

export interface IUnitDetail {
  unitId: string;
  unitTitle: string;
  progress: number;
  contents: {
    type: 'nested';
    values: IContentDetail[];
  };
}

export interface IContentDetail {
  contentId: string;
  type: string;
  title: string;
  status: string;
  tracking: {
    percentComplete?: number;
    lastPosition?: number;
    currentPosition?: number;
    timeSpent?: number;
    visitedPages?: number[];
    totalPages?: number;
    lastPage?: number;
    currentPage?: number;
    questionsAttempted?: number;
    totalQuestions?: number;
    score?: number;
    answers?: {
      type: 'nested';
      values: IAnswerDetail[];
    };
  };
}

export interface IAnswerDetail {
  questionId: string;
  type: string;
  submittedAnswer: string | string[];
}

export interface ICourse {
  courseId: string;
  progress: number;
  courseDetails: Record<string, any>;
}

export interface IProfile {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  mobile: string;
  mobile_country_code: string;
  gender: string;
  dob: string;
  country:string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  status: string;
  customFields: Record<string, any>;
}

export interface IFormField {
  type: string;
  title: string;
  fieldId: string;
  value: any;
  enum?: string[];
  format?: string;
  order?: number;
  coreField?: number;
}

export interface IFormPage {
  title: string;
  pageOrder: number;
  fields: {
    [fieldId: string]: IFormField;
  };
}

export interface IUser {
  userId: string;
  profile: IProfile;
  applications: IApplication[];
  courses?: ICourse[]; // Made optional since we're removing root-level courses
  createdAt: string;
  updatedAt: string;
}

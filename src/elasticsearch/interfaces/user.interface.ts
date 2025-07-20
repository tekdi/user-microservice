export interface IApplication {
  cohortId: string;
  formId?: string;
  submissionId?: string;
  status?: string;
  cohortmemberstatus?: string;
  formstatus: string;
  completionPercentage?: number; // FIXED: Add completionPercentage from form submission
  lastSavedAt: string;
  submittedAt: string;
  formData?: {
    [pageId: string]: {
      [fieldId: string]: any;
    };
  };
  cohortDetails: {
    name: string;
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
  courses: ICourse[];
  createdAt: string;
  updatedAt: string;
}

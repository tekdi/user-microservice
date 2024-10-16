export class CreateProjectDto {
  title: string;
  externalId: string;
  categories: string[];
  recommendedFor: string[];
  description: string;
  entityType: string;
  goal: string;

  learningResources: {
    name: string;
    link: string;
    app: string;
    id: string;
  }[];

  rationale: string;
  primaryAudience: string;
  taskCreationForm: string;
  duration: string;
  concepts: string[];
  keywords: string[];
  successIndicators: string[];
  risks: string[];
  approaches: string[];
  _arrayFields: string[];
}

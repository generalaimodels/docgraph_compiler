export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "password"
  | "checkbox"
  | "radio"
  | "select"
  | "file"
  | "hidden"
  | "date"
  | "submit";

export interface FormFieldNode {
  kind: "form-field";
  fieldType: FormFieldType;
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: FormOptionNode[];
  validation?: FormValidation;
}

export interface FormOptionNode {
  label: string;
  value: string;
  selected?: boolean;
}

export interface FormValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ async: false })
export class NotInFutureConstraint implements ValidatorConstraintInterface {
    validate(value: any): boolean {
        if (!value) return false; // Ensure value exists
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of the day
        const inputDate = new Date(value);
        return inputDate <= today; // Must be today or in the past
    }

    defaultMessage(): string {
        return 'Date cannot be in the future';
    }
}

export function NotInFuture(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: NotInFutureConstraint,
        });
    };
}

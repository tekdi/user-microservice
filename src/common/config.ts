export default {
  MINIMUM_AGE: parseInt(process.env.MINIMUM_AGE, 10) || 18, // Default to 18 if not set

  isUserOldEnough(dobString: string): boolean {
    const minimumAge = this.MINIMUM_AGE;
    const dob = new Date(dobString);
    const today = new Date();

    // Calculate age
    const age = today.getFullYear() - dob.getFullYear();
    const isBirthdayPassed =
      today.getMonth() > dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());

    return age > minimumAge || (age === minimumAge && isBirthdayPassed);
  },
};

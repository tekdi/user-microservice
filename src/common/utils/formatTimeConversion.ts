export function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) {
        return `${seconds} seconds`;
    } else if (seconds < 3600) { // less than 1 hour
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minutes`;
    } else {
        const hours = Math.floor(seconds / 3600);
        return `${hours} hours`;
    }
}
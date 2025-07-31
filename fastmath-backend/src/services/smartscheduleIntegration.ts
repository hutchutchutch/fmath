import crypto from 'crypto';
import axios from 'axios';

const SMARTSCHEDULE_API_KEY = "fastmath_ZGlzZWFzZWxhc3RiZW50YmV0d2VlbnlvdXRoY2l0aXplbnRob3VnaHNob3VsZGVyYnU";
const SMARTSCHEDULE_API_ENDPOINT = "https://smartschedule.superbuilders.tech/api/v1/log/batch";
const CARD_REVIEW_EVENT_TYPE_URL = "type.googleapis.com/smartschedule.apps.fastmath.card_review.v1.CardReviewEvent";

// this is the secret key used to pseudonymize student IDs
// it doesn't need to be known on the SmartSchedule side,
// then the students are pseudonymous and one can do data analysis
// or serve requests from the SmartSchedule API without having stored
// personally identifiable information on that side.
// A hash of the key is transmitted so SmartSchedule can detect unrecognized keys
const SMARTSCHEDULE_HMAC_SECRET_KEY = "aGFuZHNvbWVjbGFzc3JlYWxpemVtYWlsZG9zYWZlZG9sbHNjb3JlbmV3Y29uZGl0aW8";

interface SmartScheduleEventPayload {
    "@type": string;
    fact_id: string;
    result: "CORRECT" | "INCORRECT";
    time_spent_ms: number;
    think_time_ms?: number; // Made optional
    student_answer?: string; // Made optional
    schema_version: number;
}

interface SmartScheduleEvent {
    app_id: "fastmath";
    app_variant: string; // e.g., "fastmath-backend-v1.0"
    student_id: string;
    event_timestamp_utc: string;
    event_payload: SmartScheduleEventPayload;
}

interface SmartScheduleBatchRequest {
    events: SmartScheduleEvent[];
}

interface FactFluency {
    attempted: boolean;
    correct?: boolean;
    timeSpent?: number;
    think_time_ms?: number; // Added optional think_time_ms
    student_answer?: string; // Added optional student_answer
}

// the ID contains the first 8 chars of a HMAC_SECRET_KEY hash
// so the smartschedule API can distinguish differently hashed keys
// and reject requests from unrecognized/mistyped keys
function generatePseudonymizedStudentId(userId: string): string {
    const hashedSecretKey = crypto.createHash('sha256').update(SMARTSCHEDULE_HMAC_SECRET_KEY).digest('hex');
    const hmac = crypto.createHmac('sha256', SMARTSCHEDULE_HMAC_SECRET_KEY);
    hmac.update(userId);
    const hashedUserId = hmac.digest('hex');
    return `${hashedSecretKey.substring(0, 8)}${hashedUserId}`;
}

export async function sendToSmartSchedule(userId: string, facts: { [factId: string]: FactFluency }, appVariant: string): Promise<void> {
    if (!userId) {
        console.warn("SmartSchedule: User ID is missing, skipping event logging.");
        return;
    }

    const pseudonymizedStudentId = generatePseudonymizedStudentId(userId);
    const events: SmartScheduleEvent[] = [];

    for (const [factId, factData] of Object.entries(facts)) {
        if (factData.attempted) {
            const eventTimestamp = new Date().toISOString();
            const eventPayload: SmartScheduleEventPayload = {
                "@type": CARD_REVIEW_EVENT_TYPE_URL,
                fact_id: factId,
                result: factData.correct ? "CORRECT" : "INCORRECT",
                time_spent_ms: factData.timeSpent || 0,
                schema_version: 1,
            };

            if (factData.think_time_ms !== undefined) {
                eventPayload.think_time_ms = factData.think_time_ms;
            }

            if (factData.student_answer !== undefined) {
                eventPayload.student_answer = factData.student_answer;
            }

            const event: SmartScheduleEvent = {
                app_id: "fastmath",
                app_variant: appVariant,
                student_id: pseudonymizedStudentId,
                event_timestamp_utc: eventTimestamp,
                event_payload: eventPayload,
            };
            events.push(event);
        }
    }

    if (events.length === 0) {
        return;
    }

    const payload: SmartScheduleBatchRequest = { events };

    try {
        // Intentionally not awaiting this to make it non-blocking
        axios.post(SMARTSCHEDULE_API_ENDPOINT, payload, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SMARTSCHEDULE_API_KEY}`,
            },
        }).then(response => {
            // Success - no logging needed
        }).catch(error => {
            if (error.response) {
                console.error(`SmartSchedule: API request failed for student ${pseudonymizedStudentId} with status ${error.response.status}:`, error.response.data);
            } else if (error.request) {
                console.error(`SmartSchedule: API request failed for student ${pseudonymizedStudentId}. No response received:`, error.request);
            } else {
                console.error(`SmartSchedule: Error setting up API request for student ${pseudonymizedStudentId}:`, error.message);
            }
        });
    } catch (error) {
        // This catch is for synchronous errors during the setup of the axios request,
        // which is unlikely for a simple POST but included for completeness.
        console.error(`SmartSchedule: Synchronous error preparing API request for student ${pseudonymizedStudentId}:`, error);
    }
} 
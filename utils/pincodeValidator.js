import axios from "axios";

/**
 * Validates a 6-digit Indian pincode against the India Post API
 * and returns the district and state.
 * 
 * @param {string} pincode 
 * @returns {Promise<{success: boolean, district?: string, state?: string, message?: string}>}
 */
export const checkPincode = async (pincode) => {
    try {
        if (!/^[0-9]{6}$/.test(pincode)) {
            return {
                success: false,
                message: "Invalid pincode"
            };
        }

        const response = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
        
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            return {
                success: false,
                message: "Invalid pincode"
            };
        }

        const result = response.data[0];
        
        if (result.Status !== "Success" || !result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) {
            return {
                success: false,
                message: "Invalid pincode"
            };
        }

        // Get district and state from the first post office record
        const firstRecord = result.PostOffice[0];
        const district = firstRecord.District;
        const state = firstRecord.State;

        if (!district || !state) {
            return {
                success: false,
                message: "Invalid pincode"
            };
        }

        return {
            success: true,
            district: district.trim(),
            state: state.trim()
        };

    } catch (error) {
        console.error("Pincode Validation API Error:", error.message);
        return {
            success: false,
            message: "Pincode API error. Please try again later."
        };
    }
};

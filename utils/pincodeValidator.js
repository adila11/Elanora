import axios from "axios";
import { MESSAGES } from '../constants/messages.js';

export const checkPincode = async (req, res) => {
    try {
        const { pincode } = req.params;

        if (!/^[0-9]{6}$/.test(pincode)) {
            return res.status(400).json({ success: false, message: MESSAGES.VALIDATION_INVALID_PINCODE });
        }

        const response = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
        
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            return res.status(400).json({ success: false, message: MESSAGES.VALIDATION_INVALID_PINCODE });
        }

        const result = response.data[0];
        
        if (result.Status !== "Success" || !result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) {
            return res.status(400).json({ success: false, message: MESSAGES.VALIDATION_INVALID_PINCODE });
        }

        const firstRecord = result.PostOffice[0];
        const district = firstRecord.District;
        const state = firstRecord.State;

        if (!district || !state) {
            return res.status(400).json({ success: false, message: MESSAGES.VALIDATION_INVALID_PINCODE });
        }

        return res.json({
            success: true,
            data: {
                district: district.trim(),
                state: state.trim()
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: MESSAGES.SERVER_INTERNAL_SERVER_ERROR });
    }
};

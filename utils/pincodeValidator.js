import axios from "axios";

export const checkPincode = async (req, res) => {
    try {
        const { pincode } = req.params;

        if (!/^[0-9]{6}$/.test(pincode)) {
            return res.status(400).json({ success: false, message: "Invalid pincode" });
        }

        const response = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
        
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid pincode" });
        }

        const result = response.data[0];
        
        if (result.Status !== "Success" || !result.PostOffice || !Array.isArray(result.PostOffice) || result.PostOffice.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid pincode" });
        }

        const firstRecord = result.PostOffice[0];
        const district = firstRecord.District;
        const state = firstRecord.State;

        if (!district || !state) {
            return res.status(400).json({ success: false, message: "Invalid pincode" });
        }

        return res.json({
            success: true,
            data: {
                district: district.trim(),
                state: state.trim()
            }
        });

    } catch (error) {
        console.error("Pincode Validation API Error:", error.message);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

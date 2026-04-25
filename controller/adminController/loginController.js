import Admin from "../../model/adminSchema.js";

export const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('admin/dashboard');
        }

        return res.render("admin/login", { error: null });

    } catch (error) {
        console.log(error);
        res.status(500).send("Server error");
    }
};

export const login = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('admin/dashboard');
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.render("admin/login", { 
                error: "All fields are required" 
            });
        }
        
        const admin = await Admin.findOne({ email });
        
        if (!admin) {
            return res.render("admin/login", { 
                error: "Admin not found" 
            });
        }
        console.log(email , password)
        console.log(admin.password)
        if(admin.password!=password){
            return res.render("admin/login", { 
                error: "Admin password incorrect" 
            });
        }
      
        req.session.admin=email;
        console.log("Flag")

        res.redirect("/admin/dashboard")

    } catch (error) {
        console.log(error);
        res.status(500).send("Server error");
    }
};





export const logout =async(req,res)=>{
    try {
        delete req.session.admin
        return res.redirect("/admin")
    } catch (error) {
        console.log(error)
        return res.status(500).send("Server Error");
    }

}


export const loadDashboard=async(req,res)=>{
    try{
        if (!req.session.admin) {
            return res.redirect('/admin');
        }
        return res.render("admin/dashboard",{title:"Dashboard"})
    }catch(error){
        console.log(error)
        res.status(500).send("Server error")
    }
}


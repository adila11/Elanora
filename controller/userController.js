
const loadHomepage=async(req,res)=>{
    try{
        return res.render("home")
    }catch(error){
        console.log("home page not found")
        res.status(500).send("Server error")
    }
}
export default loadHomepage

const loadHome=async(req,res)=>{
    try{
        return res.render("user/home")
    }catch(error){
        console.log(error)
        res.status(500).send("Server error")
    }
}
export default loadHome
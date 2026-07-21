// Load Contact
export const loadContact = async (req, res) => {
    try {

        res.render("user/contact");

    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
};
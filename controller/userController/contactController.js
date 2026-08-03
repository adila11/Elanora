export const loadContact = async (req, res) => {
    try {

        res.render("user/contact");

    } catch (error) {
        res.redirect("/");
    }
};
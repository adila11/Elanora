export const loadAbout = async (req, res) => {
    try {

        res.render("user/about");

    } catch (error) {
        res.redirect("/");
    }
};

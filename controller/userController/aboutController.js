// Load About
export const loadAbout = async (req, res) => {
    try {

        res.render("user/about");

    } catch (error) {
        console.log(error);
        res.redirect("/");
    }
};

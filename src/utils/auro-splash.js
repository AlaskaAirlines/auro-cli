import { mind } from "gradient-string";
import figlet from "figlet";

export default () => {
  console.log(mind(figlet.textSync("Auro CLI")));
};

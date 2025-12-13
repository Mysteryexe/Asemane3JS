const timeline = document.getElementsByTagName("timeline")[0];
const ptrs = document.getElementsByTagName("ptr")
const body = document.getElementsByTagName("body")[0]
function animateBars(x){
  x =( x / window.innerHeight)* window.innerHeight/10
  for (let i = 0; i < ptrs.length; i++) {
    setTimeout(() => {
      if (i % 2==0){
        ptrs[i].style.backgroundPosition= `0px ${x}px`
      }else{
        ptrs[i].style.backgroundPosition= `${x}px 0px`
      }
    }, 150);
  }
}

function intro() {
  let distance = window.scrollY;
  let passed = (window.scrollY + (window.innerHeight/2)) / timeline.offsetHeight;
  document.documentElement.style.setProperty('--passed', passed );
  if (distance + window.innerHeight >= timeline.offsetHeight) {
    timeline.classList.add("done");
  } else {
    timeline.classList.remove("done");
    animateBars(distance);
  }
  if (passed >= 0.265){
    body.style.overflow="hidden";
  }else{
    body.style.overflowY="scroll";
  }
}
intro();

window.addEventListener("scroll", function () {
  intro();
});

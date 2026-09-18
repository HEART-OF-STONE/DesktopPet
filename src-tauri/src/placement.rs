use crate::HitRegion;

// Transparent window margins may leave the work area; visible content keeps a 6 DIP inset.
pub fn axis(position:i32,start:i32,length:u32,offset:f64,extent:f64,scale:f64,snap:bool,reset:bool)->i32{
    let inset=6.*scale;
    let min=(start as f64+inset-offset*scale).ceil() as i32;
    let max=(start as f64+length as f64-inset-(offset+extent)*scale).floor() as i32;
    if max<min{return min;}
    if reset{return max;}
    let value=position.clamp(min,max);
    if snap&&((value-min) as f64)<28.*scale{min}
    else if snap&&((max-value) as f64)<28.*scale{max}
    else{value}
}
pub fn overlaps(x:i32,y:i32,b:&HitRegion,scale:f64,left:i32,top:i32,width:u32,height:u32)->bool{
    let right=x as f64+(b.x+b.width)*scale;let bottom=y as f64+(b.y+b.height)*scale;
    let x=x as f64+b.x*scale;let y=y as f64+b.y*scale;
    (right.min(left as f64+width as f64)-x.max(left as f64))>=16.*scale
        &&(bottom.min(top as f64+height as f64)-y.max(top as f64))>=16.*scale
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn transparent_margins_do_not_block_screen_edges(){
        assert_eq!(axis(1900,0,1920,180.,320.,1.,true,false),1414);
        assert_eq!(axis(-1000,0,1920,180.,320.,1.,true,false),-174);
        assert_eq!(axis(800,0,1920,180.,320.,1.,false,false),800);
    }
    #[test]fn handles_negative_monitors_scaling_and_small_work_areas(){
        assert_eq!(axis(0,-3840,3840,180.,320.,2.,true,true),-1012);
        assert_eq!(axis(-5000,-3840,3840,180.,320.,2.,true,false),-4188);
        assert_eq!(axis(0,0,200,180.,320.,1.,false,false),-174);
    }
    #[test]fn recovery_uses_visible_content_instead_of_window_origin(){
        let b=HitRegion{x:180.,y:100.,width:320.,height:300.};
        assert!(overlaps(-174,-94,&b,1.,0,0,1920,1080));
        assert!(!overlaps(1900,0,&b,1.,0,0,1920,1080));
        assert!(!overlaps(-600,0,&b,1.,0,0,1920,1080));
    }
}
